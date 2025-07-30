import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn, ManyToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User_definition } from './user_definition.entity';
import { Category } from './category.entity';

@Entity('post')
export class Post {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "varchar", nullable: true })
    title: string;
    @Index()
    @ManyToOne('User_definition', { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    author: any;
    @ManyToMany('Category', (rel: any) => rel.posts, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    categories: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
