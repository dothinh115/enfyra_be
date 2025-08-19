import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('test')
export class Test {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "timestamp", nullable: true })
    date_test: Date;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
