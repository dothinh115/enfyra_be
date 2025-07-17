import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Post } from './post.entity';

@Entity('category')
export class Category {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "varchar", nullable: true })
    name: string;
    @ManyToMany('Post', (rel: any) => rel.categories, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    posts: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
