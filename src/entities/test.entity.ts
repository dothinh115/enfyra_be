import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Route_definition } from './route_definition.entity';

@Entity('test')
export class Test {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @ManyToOne('Route_definition', { nullable: false, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    route: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
